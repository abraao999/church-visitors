import type {
  ConfirmEmailScreenState,
  EmailConfirmCode,
  PasswordResetLinkStatus,
  ResetPasswordScreenState,
} from '../types';

export function confirmStateFromCode(code: EmailConfirmCode | undefined): ConfirmEmailScreenState {
  switch (code) {
    case 'expired':
      return 'expired';
    case 'used':
      return 'used';
    case 'unavailable':
      return 'temporary';
    case 'invalid':
    case 'too_many':
      return 'invalid';
    default:
      return 'invalid';
  }
}

export function resetStateFromStatus(status: PasswordResetLinkStatus): ResetPasswordScreenState {
  switch (status) {
    case 'valid':
      return 'form';
    case 'expired':
      return 'expired';
    case 'used':
      return 'used';
    default:
      return 'invalid';
  }
}

export function isApiErrorCode(value: unknown): value is EmailConfirmCode {
  return (
    value === 'invalid' ||
    value === 'expired' ||
    value === 'used' ||
    value === 'unavailable' ||
    value === 'too_many'
  );
}

export function readErrorCode(error: unknown): EmailConfirmCode | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return isApiErrorCode(code) ? code : undefined;
  }
  return undefined;
}
