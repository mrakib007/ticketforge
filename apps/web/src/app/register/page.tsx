import { AuthForm } from '../auth/form';

export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <AuthForm mode="register" error={(await searchParams).error} />;
}
