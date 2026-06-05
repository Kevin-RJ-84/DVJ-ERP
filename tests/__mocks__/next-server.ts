// Minimal Next.js server API mock for Jest (Node environment).
// Only the APIs actually used in lib/ and app/api/ are implemented.

export class NextResponse {
  readonly status: number;
  private readonly _body: string;
  readonly headers: Headers;

  constructor(body: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    this._body = typeof body === "string" ? body : JSON.stringify(body);
    this.headers = new Headers(init?.headers as Record<string, string>);
  }

  static json(data: unknown, init?: ResponseInit): NextResponse {
    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string>),
      },
    });
  }

  async json(): Promise<unknown> {
    return JSON.parse(this._body);
  }

  async text(): Promise<string> {
    return this._body;
  }
}

export class NextRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  private readonly _body: string;
  readonly cookies: { get: (name: string) => { value: string } | undefined };

  constructor(url: string, init?: RequestInit & { cookies?: Record<string, string> }) {
    this.url = url;
    this.method = (init?.method ?? "GET").toUpperCase();
    this.headers = new Headers(init?.headers as Record<string, string>);
    this._body = typeof init?.body === "string" ? init.body : "";
    const cookieMap = init?.cookies ?? {};
    const cookieHeader = this.headers.get("cookie") ?? "";
    // Parse cookie header
    const parsedCookies: Record<string, string> = { ...cookieMap };
    for (const part of cookieHeader.split(";")) {
      const [k, ...v] = part.split("=");
      if (k) parsedCookies[k.trim()] = v.join("=").trim();
    }
    this.cookies = {
      get: (name: string) =>
        parsedCookies[name] ? { value: parsedCookies[name] } : undefined,
    };
  }

  get searchParams(): URLSearchParams {
    return new URL(this.url).searchParams;
  }

  async json(): Promise<unknown> {
    return JSON.parse(this._body);
  }

  async text(): Promise<string> {
    return this._body;
  }

  async formData(): Promise<FormData> {
    // Returns empty FormData for non-multipart test requests.
    return new FormData();
  }
}
