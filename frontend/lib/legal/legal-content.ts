export interface LegalDocument {
  title: string;
  lastUpdated: string;
  version: string;
  sections: LegalSection[];
}

export interface LegalSection {
  id: string;
  title: string;
  content: string[];
  subsections?: LegalSection[];
}

export const termsOfService: LegalDocument = {
  title: 'Terms of Service',
  lastUpdated: '2025-01-15',
  version: '1.0.0',
  sections: [
    {
      id: 'acceptance',
      title: '1. Acceptance of Terms',
      content: [
        'By accessing and using the Aura28 astrology reading service ("Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this Service.',
        'These Terms of Service apply to all users of the Service, including without limitation users who are browsers, vendors, customers, merchants, and/or contributors of content.',
      ],
    },
    {
      id: 'service-description',
      title: '2. Service Description',
      content: [
        'Aura28 provides personalized soul blueprint astrology readings based on your birth information. Our Service includes:',
        '• Comprehensive astrological analysis based on your birth data',
        '• Personalized soul blueprint interpretation',
        '• Digital delivery of your reading',
        '• Access to your reading through your account dashboard',
        'The Service is offered for a one-time fee of $147 USD per reading.',
      ],
    },
    {
      id: 'account-responsibilities',
      title: '3. Account Responsibilities',
      content: [
        'When you create an account with us, you must provide information that is accurate, complete, and current at all times. You are responsible for:',
        '• Maintaining the confidentiality of your account and password',
        '• Restricting access to your computer and account',
        '• All activities that occur under your account or password',
        'You must be at least 18 years old to use this Service. By using the Service, you represent and warrant that you are of legal age to form a binding contract.',
      ],
    },
    {
      id: 'accuracy-of-information',
      title: '4. Accuracy of Birth Information',
      content: [
        'The accuracy of your astrology reading depends entirely on the accuracy of the birth information you provide. You acknowledge that:',
        '• You are responsible for providing accurate birth date, time, and location',
        '• Incorrect information will result in an inaccurate reading',
        '• We are not responsible for readings based on incorrect information',
        '• Refunds will not be issued for readings generated from incorrect birth data',
      ],
    },
    {
      id: 'payment-terms',
      title: '5. Payment Terms',
      content: [
        'All purchases are final upon completion of payment processing. By purchasing a reading, you agree to:',
        '• Pay the full amount of $147 USD for each reading',
        '• Provide accurate billing information',
        '• Authorize us to charge your payment method',
        'We use secure third-party payment processors to handle all transactions. We do not store your payment card information on our servers.',
      ],
    },
    {
      id: 'refund-policy',
      title: '6. Refund Policy',
      content: [
        'Due to the personalized and digital nature of our Service, all sales are final. Refunds will only be considered in the following circumstances:',
        '• Technical error preventing delivery of your reading',
        '• Duplicate purchases made in error',
        '• Service unavailability after payment',
        'Refund requests must be submitted within 7 days of purchase through our Issue Resolution process.',
      ],
    },
    {
      id: 'intellectual-property',
      title: '7. Intellectual Property',
      content: [
        'All content provided through the Service, including but not limited to text, graphics, logos, and astrological interpretations, is the property of Aura28 and protected by intellectual property laws.',
        'Your personalized reading is provided for your personal use only. You may not:',
        '• Reproduce, distribute, or publicly display your reading for commercial purposes',
        '• Sell or transfer your reading to third parties',
        '• Use the content to create derivative works',
      ],
    },
    {
      id: 'disclaimer',
      title: '8. Disclaimer of Warranties',
      content: [
        'The Service is provided "as is" and "as available" without any warranties of any kind, either express or implied. Aura28 specifically disclaims:',
        '• The accuracy, completeness, or usefulness of astrological interpretations',
        '• That the Service will meet your specific requirements',
        '• That the Service will be uninterrupted, secure, or error-free',
        'Astrology readings are for entertainment and personal insight purposes only. They should not be used as a substitute for professional advice in legal, medical, financial, or other matters.',
      ],
    },
    {
      id: 'limitation-liability',
      title: '9. Limitation of Liability',
      content: [
        'In no event shall Aura28, its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages resulting from:',
        '• Your use or inability to use the Service',
        '• Any unauthorized access to or use of our servers',
        '• Any interruption or cessation of transmission to or from the Service',
        '• Any errors or omissions in any content',
        'Our total liability shall not exceed the amount paid by you for the Service.',
      ],
    },
    {
      id: 'privacy',
      title: '10. Privacy',
      content: [
        'Your use of the Service is also governed by our Privacy Policy. Please review our Privacy Policy, which also governs the Site and informs users of our data collection practices.',
        'We respect your privacy and are committed to protecting your personal information. We will not sell, share, or rent your personal information to third parties without your consent.',
      ],
    },
    {
      id: 'modifications',
      title: '11. Modifications to Terms',
      content: [
        'We reserve the right to modify these Terms of Service at any time. We will notify users of any changes by:',
        '• Posting the new Terms of Service on this page',
        '• Updating the "Last Updated" date',
        '• Sending an email notification to registered users',
        'Your continued use of the Service after any modifications constitutes acceptance of the new Terms of Service.',
      ],
    },
    {
      id: 'termination',
      title: '12. Termination',
      content: [
        'We may terminate or suspend your account immediately, without prior notice or liability, for any reason, including without limitation if you breach the Terms of Service.',
        'Upon termination, your right to use the Service will cease immediately. All provisions of the Terms which by their nature should survive termination shall survive.',
      ],
    },
    {
      id: 'governing-law',
      title: '13. Governing Law',
      content: [
        'These Terms shall be governed and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.',
        'Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights.',
      ],
    },
    {
      id: 'contact',
      title: '14. Contact Information',
      content: [
        'If you have any questions about these Terms of Service, please contact us through our Issue Resolution page or email us at support@aura28.com.',
        'For general inquiries, account issues, or technical support, please visit our Issue Resolution page for the fastest response.',
      ],
    },
  ],
};

export const privacyPolicy: LegalDocument = {
  title: 'Privacy Policy',
  lastUpdated: '2025-01-15',
  version: '1.0.0',
  sections: [
    {
      id: 'introduction',
      title: '1. Introduction',
      content: [
        'Welcome to Aura28. We respect your privacy and are committed to protecting your personal data. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our astrology reading service.',
        'Please read this Privacy Policy carefully. If you do not agree with the terms of this Privacy Policy, please do not access the Service.',
      ],
    },
    {
      id: 'information-collection',
      title: '2. Information We Collect',
      content: [
        'We collect information you provide directly to us, including:',
        '• Account Information: Email address, password, and authentication credentials',
        '• Birth Information: Birth date, birth time, birth location (city, state, country)',
        '• Payment Information: Processed securely through third-party payment processors',
        '• Communication Data: Messages you send to us through the platform',
        'We also automatically collect certain information when you use the Service:',
        '• Log Data: IP address, browser type, device information',
        '• Usage Data: Pages visited, features used, time spent on the Service',
      ],
    },
    {
      id: 'use-of-information',
      title: '3. How We Use Your Information',
      content: [
        'We use the information we collect to:',
        '• Provide and deliver your personalized astrology reading',
        '• Create and maintain your account',
        '• Process payments and send transaction confirmations',
        '• Respond to your comments, questions, and customer service requests',
        '• Send administrative information and service updates',
        '• Improve and optimize our Service',
        '• Detect, prevent, and address technical issues',
        '• Comply with legal obligations',
      ],
    },
    {
      id: 'data-sharing',
      title: '4. Information Sharing and Disclosure',
      content: [
        'We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following situations:',
        '• Service Providers: With third-party vendors who perform services on our behalf (e.g., payment processing, email delivery)',
        '• Legal Requirements: If required by law or in response to valid legal processes',
        '• Business Transfers: In connection with any merger, sale of company assets, or acquisition',
        '• Consent: With your explicit consent for any other purpose',
        'All third-party service providers are contractually obligated to protect your information and use it only for the purposes we specify.',
      ],
    },
    {
      id: 'data-security',
      title: '5. Data Security',
      content: [
        'We implement appropriate technical and organizational security measures to protect your personal information, including:',
        '• Encryption of data in transit and at rest',
        '• Secure authentication protocols (AWS Cognito)',
        '• Regular security assessments and updates',
        '• Limited access to personal information on a need-to-know basis',
        'However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to protect your personal information, we cannot guarantee absolute security.',
      ],
    },
    {
      id: 'data-retention',
      title: '6. Data Retention',
      content: [
        'We retain your personal information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required by law.',
        '• Account data: Retained while your account is active',
        '• Reading data: Permanently stored for your future access',
        '• Payment records: Retained as required for tax and accounting purposes',
        '• Communication records: Retained for customer service quality assurance',
        'You may request deletion of your account and associated data at any time through our Issue Resolution process.',
      ],
    },
    {
      id: 'your-rights',
      title: '7. Your Data Protection Rights',
      content: [
        'Depending on your location, you may have the following rights regarding your personal information:',
        '• Access: Request a copy of your personal data',
        '• Correction: Request correction of inaccurate data',
        '• Deletion: Request deletion of your personal data',
        '• Portability: Request transfer of your data to another service',
        '• Objection: Object to certain processing of your data',
        '• Restriction: Request restriction of processing your data',
        'To exercise any of these rights, please contact us through our Issue Resolution page.',
      ],
    },
    {
      id: 'cookies',
      title: '8. Cookies and Tracking Technologies',
      content: [
        'We use cookies and similar tracking technologies to track activity on our Service and hold certain information.',
        '• Essential Cookies: Required for the Service to function properly',
        '• Authentication Cookies: Used to remember your login status',
        '• Analytics Cookies: Help us understand how users interact with our Service',
        'You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, you may not be able to use some portions of our Service.',
      ],
    },
    {
      id: 'third-party',
      title: '9. Third-Party Services',
      content: [
        'Our Service may contain links to third-party websites or services that are not owned or controlled by Aura28.',
        'We have no control over and assume no responsibility for the content, privacy policies, or practices of any third-party websites or services. We strongly advise you to read the terms and conditions and privacy policies of any third-party websites you visit.',
      ],
    },
    {
      id: 'children-privacy',
      title: "10. Children's Privacy",
      content: [
        'Our Service is not intended for use by children under the age of 18. We do not knowingly collect personal information from children under 18.',
        'If we become aware that we have collected personal data from a child under age 18 without verification of parental consent, we will take steps to remove that information from our servers.',
      ],
    },
    {
      id: 'international-transfers',
      title: '11. International Data Transfers',
      content: [
        'Your information may be transferred to and maintained on computers located outside of your state, province, country, or other governmental jurisdiction where data protection laws may differ.',
        'If you are located outside the United States and choose to provide information to us, please note that we transfer the data to the United States and process it there.',
        'Your consent to this Privacy Policy followed by your submission of such information represents your agreement to that transfer.',
      ],
    },
    {
      id: 'california-rights',
      title: '12. California Privacy Rights',
      content: [
        'If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):',
        '• Right to know what personal information is collected',
        '• Right to know whether personal information is sold or disclosed',
        '• Right to say no to the sale of personal information',
        '• Right to equal service and price, even if you exercise your privacy rights',
        'We do not sell your personal information to third parties.',
      ],
    },
    {
      id: 'gdpr-rights',
      title: '13. GDPR Rights (European Users)',
      content: [
        'If you are located in the European Economic Area (EEA), you have additional rights under the General Data Protection Regulation (GDPR):',
        '• Legal basis for processing your data',
        '• Right to withdraw consent at any time',
        '• Right to lodge a complaint with a supervisory authority',
        '• Information about automated decision-making (we do not use automated decision-making)',
        'Our legal basis for collecting and using your personal information is to perform our contract with you (providing the Service you requested).',
      ],
    },
    {
      id: 'changes',
      title: '14. Changes to This Privacy Policy',
      content: [
        'We may update our Privacy Policy from time to time. We will notify you of any changes by:',
        '• Posting the new Privacy Policy on this page',
        '• Updating the "Last Updated" date at the top of this Privacy Policy',
        '• Sending an email notification to registered users for material changes',
        'You are advised to review this Privacy Policy periodically for any changes.',
      ],
    },
    {
      id: 'contact-us',
      title: '15. Contact Us',
      content: [
        'If you have any questions about this Privacy Policy or our data practices, please contact us:',
        '• Through our Issue Resolution page',
        '• By email: privacy@aura28.com',
        '• By mail: Aura28.com, 7308 E Independence Blvd, Ste C #V338, Charlotte, NC 28277',
        'For data protection inquiries or to exercise your rights, please use our Issue Resolution page for the fastest response.',
      ],
    },
  ],
};

export const issueResolutionPolicy: LegalDocument = {
  title: 'Issue Resolution Policy',
  lastUpdated: '2025-01-15',
  version: '1.0.0',
  sections: [
    {
      id: 'overview',
      title: '1. Overview',
      content: [
        'At Aura28, we are committed to providing excellent service and resolving any issues you may encounter. This Issue Resolution Policy outlines our process for handling complaints, disputes, and requests for assistance.',
        'We believe in fair, transparent, and timely resolution of all customer concerns. Our goal is to address your issue within 48 hours of receipt.',
      ],
    },
    {
      id: 'covered-issues',
      title: '2. Issues We Address',
      content: [
        'This policy covers the following types of issues:',
        '• Technical problems with accessing your reading',
        '• Account access or authentication issues',
        '• Payment and billing concerns',
        '• Refund requests (subject to our refund policy)',
        '• Privacy and data protection inquiries',
        '• General service questions and feedback',
        '• Disputes regarding service delivery',
        '• Requests for data access or deletion',
      ],
    },
    {
      id: 'resolution-process',
      title: '3. Resolution Process',
      content: [
        'Our issue resolution process follows these steps:',
        'Step 1: Submit Your Issue',
        '• Contact us through this page with a detailed description of your issue',
        '• Include relevant information (order number, account email, etc.)',
        '• Attach any supporting documentation or screenshots',
        'Step 2: Acknowledgment',
        '• We will acknowledge receipt of your issue within 24 hours',
        '• You will receive a ticket number for tracking',
        'Step 3: Investigation',
        '• Our team will investigate your issue thoroughly',
        '• We may contact you for additional information if needed',
        'Step 4: Resolution',
        '• We aim to resolve most issues within 48 hours',
        '• Complex issues may take up to 5 business days',
        '• You will receive a detailed response with our resolution',
        'Step 5: Follow-up',
        '• We will confirm that your issue has been resolved to your satisfaction',
        '• If you are not satisfied, we will escalate to senior management',
      ],
    },
    {
      id: 'response-times',
      title: '4. Response Time Commitments',
      content: [
        'We commit to the following response times:',
        '• Initial acknowledgment: Within 24 hours',
        '• Simple inquiries: Resolution within 48 hours',
        '• Technical issues: Resolution within 3 business days',
        '• Complex disputes: Resolution within 5 business days',
        '• Refund processing: 5-10 business days after approval',
        'Response times are based on business days (Monday-Friday, excluding holidays).',
      ],
    },
    {
      id: 'technical-issues',
      title: '5. Technical Issue Resolution',
      content: [
        'For technical issues, please provide:',
        '• Description of the problem',
        "• Steps you've already taken to resolve it",
        '• Browser and device information',
        '• Screenshots or error messages',
        '• Time and date the issue occurred',
        'Common technical issues and solutions:',
        '• Cannot access reading: Check your email for the confirmation link',
        '• Login problems: Use the password reset function',
        '• Payment failed: Verify your payment method and try again',
        '• Reading not loading: Clear browser cache and cookies',
      ],
    },
    {
      id: 'refund-requests',
      title: '6. Refund Request Process',
      content: [
        'Refund requests are evaluated based on our Terms of Service refund policy. To request a refund:',
        '• Submit your request within 7 days of purchase',
        '• Explain the reason for your refund request',
        '• Include your order number and purchase date',
        'Valid reasons for refunds include:',
        '• Technical error preventing delivery of your reading',
        '• Duplicate purchases made in error',
        '• Service unavailability after payment',
        'Refunds are not available for:',
        '• Change of mind after receiving your reading',
        '• Dissatisfaction with astrological interpretations',
        '• Incorrect birth information provided by you',
      ],
    },
    {
      id: 'account-issues',
      title: '7. Account and Access Issues',
      content: [
        'For account-related issues:',
        '• Password reset: Use the "Forgot Password" link on the login page',
        '• Account locked: Contact us with your registered email address',
        '• Email not received: Check spam folder and whitelist our domain',
        '• Profile updates: Log in to your dashboard to update information',
        '• Account deletion: Submit a formal request through this page',
        'For security reasons, we may require identity verification before making account changes.',
      ],
    },
    {
      id: 'privacy-requests',
      title: '8. Privacy and Data Requests',
      content: [
        'We handle the following privacy-related requests:',
        '• Access to your personal data',
        '• Correction of inaccurate information',
        '• Deletion of your account and data',
        '• Data portability requests',
        '• Opt-out of communications',
        'Privacy requests are processed in accordance with applicable data protection laws. We may require identity verification before processing these requests.',
      ],
    },
    {
      id: 'escalation',
      title: '9. Escalation Process',
      content: [
        'If you are not satisfied with the initial resolution:',
        'Level 1: Customer Service Team',
        '• Initial point of contact for all issues',
        '• Can resolve most common problems',
        'Level 2: Senior Support Specialist',
        '• Handles complex technical issues',
        '• Reviews refund requests',
        'Level 3: Management Team',
        '• Final decision authority',
        '• Handles escalated disputes',
        'To escalate an issue, reply to your support ticket requesting escalation and explaining why you are not satisfied with the proposed resolution.',
      ],
    },
    {
      id: 'communication',
      title: '10. Communication Channels',
      content: [
        'You can reach us through:',
        '• Primary: Issue Resolution form on this page',
        '• Email: support@aura28.com',
        '• Response times may vary by channel',
        'For fastest response, we recommend using the Issue Resolution form on this page. Please do not submit the same issue through multiple channels as this may delay resolution.',
      ],
    },
    {
      id: 'documentation',
      title: '11. Documentation Requirements',
      content: [
        'To help us resolve your issue quickly, please provide:',
        '• Clear description of the issue',
        '• Relevant dates and times',
        '• Order or transaction numbers',
        '• Screenshots or error messages',
        '• Previous correspondence about the issue',
        "• Any steps you've already taken",
        'The more information you provide, the faster we can resolve your issue.',
      ],
    },
    {
      id: 'feedback',
      title: '12. Feedback and Improvement',
      content: [
        'We value your feedback and use it to improve our service:',
        '• All resolved issues include a satisfaction survey',
        '• Feedback is reviewed by management monthly',
        '• Common issues lead to service improvements',
        '• Suggestions for improvement are always welcome',
        'Your feedback helps us provide better service to all customers.',
      ],
    },
    {
      id: 'legal-disputes',
      title: '13. Legal Disputes',
      content: [
        'For legal disputes that cannot be resolved through our standard process:',
        '• We encourage good faith negotiation first',
        '• Mediation may be suggested for complex disputes',
        '• Arbitration procedures as outlined in our Terms of Service',
        '• Legal notices should be sent to legal@aura28.com',
        'We aim to resolve all disputes amicably without the need for formal legal proceedings.',
      ],
    },
    {
      id: 'policy-updates',
      title: '14. Policy Updates',
      content: [
        'This Issue Resolution Policy may be updated periodically to improve our processes. Updates will be posted on this page with the new "Last Updated" date.',
        'Major changes will be communicated to registered users via email. Your continued use of the service after policy updates constitutes acceptance of the changes.',
      ],
    },
    {
      id: 'contact-info',
      title: '15. Contact Information',
      content: [
        'For issues not covered by this policy or general inquiries:',
        '• Email: support@aura28.com',
        '• Business Hours: Monday-Friday, 9 AM - 5 PM EST',
        '• Expected Response: Within 1-2 business days',
        'We are committed to providing excellent customer service and resolving all issues fairly and promptly.',
      ],
    },
  ],
};
