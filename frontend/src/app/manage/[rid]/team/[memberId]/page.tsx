"use client";

import { useParams } from "next/navigation";

import { MemberDetail } from "@/components/manage/team/member-detail";

export default function TeamMemberPage() {
  const { rid, memberId } = useParams<{ rid: string; memberId: string }>();
  return <MemberDetail rid={rid} memberId={memberId} />;
}
