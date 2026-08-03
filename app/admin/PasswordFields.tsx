interface PasswordFieldsProps {
  password: string;
  confirmation: string;
  onPasswordChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
}

export function PasswordFields({
  password,
  confirmation,
  onPasswordChange,
  onConfirmationChange,
}: PasswordFieldsProps) {
  return (
    <>
      <label htmlFor="new-password" className="mb-1 block text-sm font-semibold">
        New password
      </label>
      <input
        id="new-password"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
        className="night-input mb-4 px-4 py-3"
      />
      <label
        htmlFor="confirm-password"
        className="mb-1 block text-sm font-semibold"
      >
        Confirm new password
      </label>
      <input
        id="confirm-password"
        type="password"
        autoComplete="new-password"
        required
        minLength={12}
        value={confirmation}
        onChange={(event) => onConfirmationChange(event.target.value)}
        className="night-input mb-2 px-4 py-3"
      />
      <p className="night-muted mb-5 text-xs">Use at least 12 characters.</p>
    </>
  );
}
