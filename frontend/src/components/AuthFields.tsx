import { useState } from "react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon } from "@/components/AuthIcons";

type FieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
};

function LeadingIcon({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
      {children}
    </span>
  );
}

/** Email field with a mail icon. */
export function EmailInput({ id, value, onChange, placeholder, autoComplete = "username", required }: FieldProps) {
  return (
    <div className="relative">
      <LeadingIcon>
        <MailIcon size={16} />
      </LeadingIcon>
      <Input
        id={id}
        type="email"
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="pl-9"
      />
    </div>
  );
}

/** Password field with a lock icon, a show/hide toggle, and a Caps Lock warning. */
export function PasswordInput({ id, value, onChange, placeholder, autoComplete, required }: FieldProps) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  function checkCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === "function") setCapsLock(e.getModifierState("CapsLock"));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <LeadingIcon>
          <LockIcon size={16} />
        </LeadingIcon>
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          onBlur={() => setCapsLock(false)}
          required={required}
          className="pl-9 pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
        </button>
      </div>
      {capsLock && (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
          Caps Lock is on
        </p>
      )}
    </div>
  );
}
