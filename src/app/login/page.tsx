import LoginForm from "./LoginForm";
export const metadata = { title: "Sign in" };
export default function Login() {
  return (
    <main className="login">
      <div className="logo"><span className="mark" aria-hidden="true" />Typecast</div>
      <p className="tagline">Track every film and series you watch, find what to watch next, and never miss a new episode.</p>
      <LoginForm />
    </main>
  );
}
