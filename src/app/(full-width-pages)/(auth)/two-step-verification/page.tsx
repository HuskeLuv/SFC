import OtpForm from "@/components/auth/OtpForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title:
    "",
  description: "",
  // other metadata
};

export default function OtpVerification() {
  return <OtpForm />;
}
