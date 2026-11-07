import LoginForm from "./LoginForm";
export const metadata = { title: "Sign in" };
export default function Login() {
  return (
    <main className="login">
      <div className="logo"><span className="mark" aria-hidden="true" />Typecast</div>
      <LoginForm />
    </main>
  );
}
