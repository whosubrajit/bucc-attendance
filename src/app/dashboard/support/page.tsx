import { Mail, HelpCircle, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { getCurrentMember } from "@/lib/page-guards";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/");
  }

  const faqs = [
    {
      question: "How do I mark my attendance?",
      answer: "Click the 'Mark Attendance' button in the navigation bar. You can either scan the QR code displayed by the session admin or manually check in if the session allows it.",
      icon: <CheckCircle2 className="mt-0.5 h-5 w-5 text-electric-600" aria-hidden />
    },
    {
      question: "How do I sign out of a session?",
      answer: "Go to your Dashboard, find the active session under 'My Attendance', and click 'Sign Out'. Your sign-out request will be sent to the HR team or your department executives for approval.",
      icon: <Clock className="mt-0.5 h-5 w-5 text-electric-600" aria-hidden />
    },
    {
      question: "Why hasn't my sign-out been approved yet?",
      answer: "If your sign-out request is pending for more than 30 minutes, it automatically escalates to the Governing Body. If it takes longer than 2 hours, the system will auto-approve it for you. Don't worry, your exact sign-out time is recorded when you click the button.",
      icon: <AlertCircle className="mt-0.5 h-5 w-5 text-electric-600" aria-hidden />
    }
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">Help & Support</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Find answers to common questions or reach out to the HR team for assistance.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div key={idx} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-navy-800 dark:bg-navy-900">
                <div className="shrink-0">{faq.icon}</div>
                <div>
                  <h3 className="font-medium text-slate-900 dark:text-white">{faq.question}</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{faq.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-navy-800 dark:bg-navy-900">
            <div className="mb-4 inline-flex rounded-xl bg-electric-100 p-3 text-electric-600 dark:bg-electric-600/20 dark:text-electric-400">
              <HelpCircle className="h-6 w-6" aria-hidden />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Still need help?</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 mb-6">
              If your issue isn't listed here or you need to correct your attendance hours, please contact the Human Resources department.
            </p>
            
            <a 
              href="mailto:dibyosingho.barua.subrajit@g.bracu.ac.bd?subject=BUCC%20Attendance%20Support"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-electric-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-electric-500 shadow-sm"
            >
              <Mail className="h-4 w-4" aria-hidden /> Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
