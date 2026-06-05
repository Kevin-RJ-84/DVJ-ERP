const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export function isValidPassword(password: string) {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    PASSWORD_RULE.test(password)
  );
}

export function passwordRuleMessage() {
  return "Password must be at least 8 characters and include at least one letter and one number.";
}
