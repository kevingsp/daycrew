import type { SVGProps } from "react";

export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" d="M2 2h7a8 8 0 1 1 0 16H2zm4 4v8h3a4 4 0 1 0 0-8z"
        fill="currentColor"
      />
    </svg>
  );
}
