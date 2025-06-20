// Security validator utility for auth service
export class SecurityValidator {
  static validateEmail(email: string): boolean {
    const pattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return pattern.test(email);
  }

  static validatePassphraseStrength(passphrase: string): {
    isValid: boolean;
    score: number;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 0;

    // Length check
    if (passphrase.length < 12) {
      errors.push("Passphrase must be at least 12 characters long");
    } else if (passphrase.length >= 20) {
      score += 3;
    } else if (passphrase.length >= 16) {
      score += 2;
    } else {
      score += 1;
    }

    // Character variety
    if (/[a-z]/.test(passphrase)) {
      score += 1;
    } else {
      warnings.push("Include lowercase letters");
    }

    if (/[A-Z]/.test(passphrase)) {
      score += 1;
    } else {
      warnings.push("Include uppercase letters");
    }

    if (/[0-9]/.test(passphrase)) {
      score += 1;
    } else {
      warnings.push("Include numbers");
    }

    if (/[^a-zA-Z0-9]/.test(passphrase)) {
      score += 1;
    } else {
      warnings.push("Include special characters");
    }

    // Common patterns check
    const commonPatterns = ['123456', '654321', 'password', 'qwerty', 'abc123', 'letmein'];
    for (const pattern of commonPatterns) {
      if (passphrase.toLowerCase().includes(pattern.toLowerCase())) {
        errors.push(`Avoid common patterns like '${pattern}'`);
        score = Math.max(0, score - 2);
        break;
      }
    }

    // Sequential characters check
    let hasSequence = false;
    for (let i = 0; i < passphrase.length - 2; i++) {
      if (passphrase.charCodeAt(i + 1) === passphrase.charCodeAt(i) + 1 &&
          passphrase.charCodeAt(i + 2) === passphrase.charCodeAt(i + 1) + 1) {
        hasSequence = true;
        break;
      }
    }

    if (hasSequence) {
      warnings.push("Avoid sequential characters");
      score = Math.max(0, score - 1);
    }

    return {
      isValid: errors.length === 0 && score >= 4,
      score: Math.min(7, score),
      errors,
      warnings
    };
  }

  static validateWalletAddress(address: string, type: 'sei' | 'eth'): boolean {
    if (type === 'sei') {
      return address.startsWith('sei1') && address.length >= 10;
    } else if (type === 'eth') {
      return address.startsWith('0x') && address.length === 42;
    }
    return false;
  }

  static sanitizeInput(input: string): string {
    // Remove potentially dangerous characters and limit length
    return input.replace(/[<>"/\\&]/g, '').substring(0, 1000);
  }

  static validateAuthRequest(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.email || !this.validateEmail(data.email)) {
      errors.push("Valid email is required");
    }

    if (!data.passphrase || data.passphrase.length < 8) {
      errors.push("Passphrase must be at least 8 characters");
    }

    if (data.passphrase && data.passphrase.length > 1000) {
      errors.push("Passphrase too long");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
