import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import FormField from "./FormField.jsx";

/**
 * Password input with an inline show/hide button.
 *
 * The button is a real toggle — `aria-pressed` tells a screen reader whether the
 * password is currently revealed, so it is usable without sight.
 */
export default function PasswordField({ label = "Password", hint, ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <FormField
      {...props}
      label={label}
      hint={hint}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          className="field__toggle"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-label={visible ? "Hide password" : "Show password"}
          title={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      }
    />
  );
}
