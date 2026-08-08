import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function FormField({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`block text-sm font-medium text-fg-neutral ${className}`.trim()}><span>{label}</span>{hint && <span className="ml-1 font-normal text-fg-neutral-subtle">{hint}</span>}<span className="mt-2 block">{children}</span></label>;
}

export function TextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`seed-input ${className}`.trim()} {...props} />;
}

export function SelectInput({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`seed-select ${className}`.trim()} {...props} />;
}

export function ActionButton({ variant = "primary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return <button type={type} className={`seed-button seed-button-${variant} ${className}`.trim()} {...props} />;
}

export function FeedbackMessage({ tone, children, className = "" }: { tone: "critical" | "positive" | "neutral"; children: ReactNode; className?: string }) {
  return <p role={tone === "critical" ? "alert" : "status"} className={`seed-feedback seed-feedback-${tone} ${className}`.trim()}>{children}</p>;
}
