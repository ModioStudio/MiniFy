import type React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  className = "",
  ...props
}) => {
  const baseClasses =
    "w-90 py-2 rounded-xl font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2";

  let variantClasses = "";

  switch (variant) {
    case "primary":
      variantClasses = "bg-black/0 text-white hover:bg-blue-700 focus:ring-blue-500";
      break;
    case "secondary":
      variantClasses = "bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400";
      break;
    case "danger":
      variantClasses = "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500";
      break;
  }

  return (
    <button className={`${baseClasses} ${variantClasses} ${className}`} {...props}>
      {children}
    </button>
  );
};
