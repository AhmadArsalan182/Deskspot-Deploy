import { Armchair, Users } from "lucide-react";

export default function SpaceTypeBadge({ type }) {
  const isRoom = type === "ROOM";
  const Icon = isRoom ? Users : Armchair;
  return (
    <span className={`badge badge--${isRoom ? "room" : "desk"}`}>
      <Icon size={13} aria-hidden="true" />
      {isRoom ? "Meeting room" : "Desk"}
    </span>
  );
}
