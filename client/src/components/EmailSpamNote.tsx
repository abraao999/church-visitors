import { AppIcon } from './AppIcon';

export function EmailSpamNote() {
  return (
    <p className="auth-spam-note" role="note">
      <AppIcon name="info" />
      <span>
        Se o e-mail não aparecer na caixa de entrada, olhe também o spam ou o lixo eletrônico.
      </span>
    </p>
  );
}
