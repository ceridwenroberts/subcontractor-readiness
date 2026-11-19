import { PageBody, PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Section = { title: string; intro?: string; items: { label: string; text: string }[] };

const SECTIONS: Section[] = [
  {
    title: "What this is",
    items: [
      {
        label: "A demo build",
        text: "A prototype and a first step toward a product. It runs on one computer with fictional data. It is not for real use and must never be deployed in this form.",
      },
      {
        label: "Documentation status only",
        text: "The tool describes what the uploaded documents show. It makes no decision. A person reviews every result and decides, and every decision is logged.",
      },
    ],
  },
  {
    title: "Simulated parts",
    intro: "These look real but are not. Each is labelled Simulated where it appears.",
    items: [
      {
        label: "Sign-in",
        text: "Two fixed demo users. Sessions are kept in memory and are lost when the server restarts. There is no real login, no roles and no secure cookie.",
      },
      {
        label: "Emails and reminders",
        text: "A request for a new upload records an email draft and shows it. Reminder drafts for expiring documents are only shown. Nothing is ever sent, and only fictional addresses (.example, .test, example.com) are accepted.",
      },
      {
        label: "Answers from a script",
        text: "When the provider is Simulated, answers come from a fixed script, not from an AI model. Use it to see the screens, not to judge accuracy.",
      },
    ],
  },
  {
    title: "Requirements and advice",
    items: [
      {
        label: "Placeholder requirements",
        text: "The VVS requirement list has not been reviewed by a domain expert. A real version needs an expert-reviewed template.",
      },
      {
        label: "Deletion dates",
        text: "The advice on the deletion date is a placeholder, not legal advice, and has not been reviewed by a data protection specialist. Nothing is deleted automatically: documents and stored text stay until someone removes them by hand.",
      },
    ],
  },
  {
    title: "Personal data",
    items: [
      {
        label: "Personal numbers are hidden",
        text: "Swedish personal and coordination numbers are hidden by code before any text is stored or sent to a model. A made-up number is used in the demo packets.",
      },
      {
        label: "Names are not hidden",
        text: "People named on certificates appear in the stored text and reach the model. This needs a privacy review before real use.",
      },
      {
        label: "Original files",
        text: "The uploaded PDFs are kept on disk and can be opened from the document viewer. The original may show personal numbers that are hidden in the text view.",
      },
      {
        label: "Fictional data only",
        text: "Upload synthetic documents only. Never real companies, people or documents.",
      },
    ],
  },
  {
    title: "How the AI part behaves",
    items: [
      {
        label: "A small local model",
        text: "The demo model misses evidence sometimes and can answer differently on two runs. A miss is visible as Evidence not found or Needs human review, and a person can override it. It is not production quality.",
      },
      {
        label: "Checks only lower a result",
        text: "Automatic code checks and a second model check can lower a result, never raise one. A result needs a quote that exists in the document text.",
      },
      {
        label: "Dates",
        text: "Dates are read in the form 2027-12-31. Other formats lower the result instead of being read, so an expiry date can be missed.",
      },
      {
        label: "Scanned pages",
        text: "Scans are not read, because there is no text recognition yet. A requirement can show Evidence not found when the evidence is in a scan. The upload warns when it sees a page with no text.",
      },
      {
        label: "Time",
        text: "An assessment takes about a minute or more with a local model.",
      },
      {
        label: "Re-assessing",
        text: "Assessing again adds new results. Earlier results and your decisions are kept.",
      },
    ],
  },
  {
    title: "Records",
    items: [
      {
        label: "Decision log",
        text: "Decisions are never edited or deleted. A new decision is a new entry. The protection is in the application, so changing the database file by hand would bypass it.",
      },
      {
        label: "Expiry warnings",
        text: "The warning periods (14, 30 and 60 days) are placeholders. A warning is only as good as the date read from the documents.",
      },
    ],
  },
  {
    title: "Not built yet",
    items: [
      { label: "Not in this version", text: "Real sign-in, sending email, reading scans, deleting data, other trades than VVS, and an expert-reviewed template." },
    ],
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader title="About this demo" subtitle="Limits and warnings you should know about." />
      <PageBody>
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              {section.intro && <CardDescription>{section.intro}</CardDescription>}
            </CardHeader>
            <CardContent className="p-0">
              <dl className="divide-y divide-border">
                {section.items.map((item) => (
                  <div key={item.label} className="grid gap-0.5 px-4 py-2.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                    <dt className="text-sm font-medium">{item.label}</dt>
                    <dd className="text-sm text-muted-foreground">{item.text}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </PageBody>
    </>
  );
}
