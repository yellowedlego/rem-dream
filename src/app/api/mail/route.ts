import { connection, NextResponse } from "next/server";
import { mailStatus } from "@/lib/mail";

/** 이 컴퓨터에서 메일을 보낼 수 있는지 (화면이 메일 칸을 보여 줄지 정한다) */
export async function GET() {
  await connection();
  return NextResponse.json(mailStatus());
}
