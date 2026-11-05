import { redirect } from "next/navigation";

// Plus d'inscription libre : les restaurants sont créés par le super admin à partir des demandes.
export default function RegisterPage() {
  redirect("/demande");
}
