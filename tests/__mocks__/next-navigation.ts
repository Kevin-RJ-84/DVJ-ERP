export const useRouter = () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() });
export const usePathname = () => "/replenishment/client";
export const useSearchParams = () => new URLSearchParams();
export const redirect = jest.fn();
