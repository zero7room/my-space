export function runtimeUrl(): string {
  return process.env['NEXT_PUBLIC_RUNTIME_URL'] ?? 'http://localhost:4000';
}

export function bearerToken(): string {
  return process.env['NEXT_PUBLIC_BEARER'] ?? '';
}
