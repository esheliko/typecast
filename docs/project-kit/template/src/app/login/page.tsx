import LoginForm from "./LoginForm";
export const metadata = { title: "Sign in" };
export default function Login() {
  return (
    <main>
      <h1>{{NAME}}</h1>
      <LoginForm />
    </main>
  );
}
