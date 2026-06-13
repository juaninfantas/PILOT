import { cn } from "../../lib/utils";

type PilotLogoProps = {
  className?: string;
  alt?: string;
};

/** Marca Pilot: P cursiva (Great Vibes) sobre fondo crema redondeado. */
export function PilotLogo({ className, alt = "Pilot" }: PilotLogoProps) {
  return (
    <span role="img" aria-label={alt} className={cn("pilot-logo-mark", className)}>
      <span aria-hidden>P</span>
    </span>
  );
}
