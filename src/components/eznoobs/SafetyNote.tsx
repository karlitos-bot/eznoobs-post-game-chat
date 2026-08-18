export function SafetyNote({ className = "" }: { className?: string }) {
  return (
    <p className={`hud-label leading-relaxed normal-case tracking-normal ${className}`}>
      Banter and profanity are fine. Threats, doxxing, hate speech, spam and targeted
      harassment are not.
    </p>
  );
}
