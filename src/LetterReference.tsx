import { useId } from "react";
import { REFERENCE_CROPS } from "./lib/references";
export function LetterReference({ letter }: { letter: string }) {
  const id = useId();
  const crop = REFERENCE_CROPS[letter]?.split(" ").map(Number);
  if (!crop) return <p>La lámina no incluye la letra {letter}.</p>;
  return (
    <svg
      className="reference-crop"
      viewBox={REFERENCE_CROPS[letter]}
      role="img"
      aria-label={`Referencia de la letra ${letter} de la lámina del equipo`}
    >
      <defs>
        <clipPath id={id}>
          <rect x={crop[0]} y={crop[1]} width={crop[2]} height={crop[3]} />
        </clipPath>
      </defs>
      <image
        clipPath={`url(#${id})`}
        href="/alfabeto-referencia.jpeg"
        width="460"
        height="667"
      />
    </svg>
  );
}
