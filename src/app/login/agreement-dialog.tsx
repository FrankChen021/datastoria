"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const TERMS_OF_SERVICE = `
# Terms of Service

Last Updated: December 27, 2025

## 1. Acceptance of Terms
By accessing or using Data Storia, you agree to be bound by these Terms of Service. 

If you **DO NOT** agree, please **DO NOT** use the service.

## 2. Description of Service
Data Storia is an AI-powered ClickHouse database management console. We provide tools for database introspection, query execution, and data visualization.

## 3. User Responsibilities
- You are responsible for maintaining the security of your account and any credentials used to connect to your databases.
- You agree **NOT** to use the service for any illegal or unauthorized purpose.
- You are responsible for all content and data you process through the service.

## 4. Privacy and Data Security
Your privacy is important to us. Please refer to our Privacy Policy for information on how we collect, use, and disclose information. 

We **DO NOT** store your database credentials on our servers.

## 5. Limitation of Liability
Data Storia is provided "as is" without any warranties. In no event shall we be liable for any damages arising out of the use or inability to use the service.

## 6. Changes to Terms
We reserve the right to modify these terms at any time. Your continued use of the service after such changes constitutes acceptance of the new terms.
`;

export const PRIVACY_POLICY = `
# Privacy Policy

Last Updated: December 27, 2025

## 1. Information We Collect
- **Account Information:** When you sign in via OAuth (Google, GitHub, Microsoft), we receive basic profile information such as your name, email address, and profile picture.
- **Usage Data:** We may collect information about how you interact with the service to improve performance and user experience.
- **Database Credentials:** We **DO NOT** store your database credentials on our servers.
- **LLM Provider API Keys:** We **DO NOT** store your LLM provider API keys on our servers.
- **Database Metadata/Row Data:** These information may be sent to the server for AI-powered suggestions, but we **DO NOT** store your actual row data on our servers.

## 2. How We Use Information
- To provide and maintain our service.
- To notify you about changes to our service.
- To provide customer support.
- To gather analysis or valuable information so that we can improve our service.

## 3. Data Storage
- We use JWT for session management. 

- Database connection strings and credentials, as well as LLM provider API keys, are typically stored locally in your browser side.

## 4. Third-Party Services
We use OAuth providers (Google, GitHub, Microsoft) for authentication. These services have their own privacy policies.

## 5. Security
The security of your data is important to us, but remember that no method of transmission over the Internet or method of electronic storage is 100% secure.

## 6. Contact Us
If you have any questions about this Privacy Policy, please contact us.
`;

interface AgreementDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  content: string;
}

export function AgreementDialog({ isOpen, onOpenChange, content }: AgreementDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0 overflow-hidden">
        <VisuallyHidden>
          <DialogTitle>Agreement</DialogTitle>
        </VisuallyHidden>
        <ScrollArea className="flex-1 p-6 pt-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ ...props }) => <h1 className="text-xl font-bold pt-4" {...props} />,
                h2: ({ ...props }) => <h2 className="text-lg font-semibold pt-4" {...props} />,
                p: ({ ...props }) => <p className="" {...props} />,
                ul: ({ ...props }) => <ul className="list-disc pl-6 mb-2 space-y-2" {...props} />,
                li: ({ ...props }) => <li {...props} />,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
