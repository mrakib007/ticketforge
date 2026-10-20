import { AuthForm } from '../auth/form';

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <AuthForm mode="login" error={(await searchParams).error} />;
}
