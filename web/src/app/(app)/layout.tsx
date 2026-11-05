import { exigirUsuario } from "@/lib/auth";
import { Nav } from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  return (
    <div className="flex">
      <Nav usuario={usuario} />
      <main className="flex-1 p-8 max-w-6xl">{children}</main>
    </div>
  );
}
