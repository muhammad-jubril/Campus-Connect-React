import { useContext } from "react";
import { PeopleContext } from "../context/PeopleContext";

export function usePeople() {
  const ctx = useContext(PeopleContext);
  if (!ctx) throw new Error("usePeople must be used inside <PeopleProvider>");
  return ctx;
}
