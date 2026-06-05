export const cookies = () => ({
  get: jest.fn().mockReturnValue(undefined),
  set: jest.fn(),
  delete: jest.fn(),
});
export const headers = () => new Headers();
