import LoginForm from "./LoginForm";
export const metadata = { title: "Sign in" };
export default function Login() {
  return (
    <main className="login">
      <div className="logo"><span className="mark" aria-hidden="true" />Typecast</div>
      <p className="tagline">Keep track of every film and series you watch, and never wonder where you know that face from again.</p>
      <LoginForm />
    </main>
  );
}
