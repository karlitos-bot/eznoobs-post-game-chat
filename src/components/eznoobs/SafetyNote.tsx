export function SafetyNote({ className = "" }: { className?: string }) {
  return (
    <p className={`hud-label leading-relaxed normal-case tracking-normal ${className}`}>
      Trash talk and profanity are fine. Hate targeting race, sex, religion or identity, plus
      threats, doxxing, spam and targeted harassment, are not.
    </p>
  );
}
