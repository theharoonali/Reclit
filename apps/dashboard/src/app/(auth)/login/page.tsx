import { LoginForm } from "@/components/auth/login-form";
import { pageMetadata } from "@/i18n/metadata";

export const generateMetadata = () => pageMetadata("login");

export default function LoginPage() {
  return <LoginForm />;
}
