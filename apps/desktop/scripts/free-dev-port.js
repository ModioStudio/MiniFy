import { execFile } from "node:child_process";
import { platform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ports = process.argv
  .slice(2)
  .flatMap((arg) => arg.split(","))
  .map((arg) => Number.parseInt(arg, 10))
  .filter((port) => Number.isInteger(port) && port > 0);

if (ports.length === 0) {
  ports.push(1420);
}

function unique(values) {
  return [...new Set(values)];
}

async function findWindowsPids(port) {
  const command = [
    "$ErrorActionPreference = 'SilentlyContinue';",
    `Get-NetTCPConnection -LocalPort ${port} -State Listen |`,
    "Select-Object -ExpandProperty OwningProcess",
  ].join(" ");

  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      command,
    ]);
    return unique(
      stdout
        .split(/\s+/)
        .map((value) => Number.parseInt(value, 10))
        .filter(Number.isInteger)
    );
  } catch {
    return [];
  }
}

async function findUnixPids(port) {
  try {
    const { stdout } = await execFileAsync("lsof", [
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-t",
    ]);
    return unique(
      stdout
        .split(/\s+/)
        .map((value) => Number.parseInt(value, 10))
        .filter(Number.isInteger)
    );
  } catch {
    return [];
  }
}

async function killPid(pid) {
  if (pid === process.pid || pid === process.ppid) {
    return;
  }

  if (platform() === "win32") {
    await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"]);
    return;
  }

  process.kill(pid, "SIGTERM");
}

for (const port of ports) {
  const pids = platform() === "win32" ? await findWindowsPids(port) : await findUnixPids(port);

  if (pids.length === 0) {
    continue;
  }

  console.log(`Port ${port} is already in use by PID(s) ${pids.join(", ")}. Stopping them...`);

  for (const pid of pids) {
    await killPid(pid);
  }
}
