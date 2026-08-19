export function SafetyNote({ className = "" }: { className?: string }) {
  return (
    <p className={`hud-label leading-relaxed normal-case tracking-normal ${className}`}>
      Trash talk + profanity are fine. Hate, threats, doxxing, spam and targeted harassment aren&apos;t.
    </p>
  );
}
