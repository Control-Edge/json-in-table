import { SVGProps } from "react";

/** The "{≡}" JSON-as-Table icon mark: braces enclosing a 3x2 cell grid. */
export function JsonTableIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M30 14 C20 14 17 19 17 28 L17 40 C17 46 14 48 8 50 C14 52 17 54 17 60 L17 72 C17 81 20 86 30 86"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M70 14 C80 14 83 19 83 28 L83 40 C83 46 86 48 92 50 C86 52 83 54 83 60 L83 72 C83 81 80 86 70 86"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="35" y="26" width="13" height="12" rx="3" fill="currentColor" />
      <rect x="52" y="26" width="13" height="12" rx="3" fill="currentColor" />
      <rect x="35" y="44" width="13" height="12" rx="3" fill="currentColor" />
      <rect x="52" y="44" width="13" height="12" rx="3" fill="currentColor" />
      <rect x="35" y="62" width="13" height="12" rx="3" fill="currentColor" />
      <rect x="52" y="62" width="13" height="12" rx="3" fill="currentColor" />
    </svg>
  );
}
