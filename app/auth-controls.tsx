import { auth, signIn, signOut } from "@/auth";

export async function AuthControls() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return (
      <form
        action={async () => {
          "use server";
          await signIn("google");
        }}
      >
        <button type="submit" className="seed-pill">
          Google로 로그인
        </button>
      </form>
    );
  }

  const label = email.split("@")[0];

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="seed-pill truncate" title={email}>
        {label}
      </span>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button type="submit" className="seed-pill">
          로그아웃
        </button>
      </form>
    </div>
  );
}
