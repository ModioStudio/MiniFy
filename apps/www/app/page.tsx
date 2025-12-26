import { DownloadSection } from "@/components/download-section";
import { FeaturesSection } from "@/components/features-section";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { HeroSection } from "@/components/hero-section";
import { OpenSourceSection } from "@/components/open-source-section";

export default function Page() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <HeroSection />
        <FeaturesSection />
        <DownloadSection />
        <OpenSourceSection />
      </main>
      <Footer />
    </div>
  );
}
