import { useState } from "react";
import { WHATSAPP_NUMBERS, whatsAppLink } from "@/lib/siteLinks";

// Floating WhatsApp launcher, site-wide (mirrors the AIAssistant widget's placement
// pattern but on the opposite corner). Expands to let the visitor pick an agent.
export default function WhatsAppButton() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="fixed bottom-6 left-6 z-50">
            {isOpen && (
                <div className="mb-3 w-64 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                    <div className="bg-green-600 px-4 py-3 text-sm font-semibold text-white">
                        Chat with us on WhatsApp
                    </div>
                    <div className="flex flex-col divide-y divide-gray-100">
                        {WHATSAPP_NUMBERS.map((agent) => (
                            <a
                                key={agent.number}
                                href={whatsAppLink(agent.number)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-green-50"
                            >
                                <i className="fab fa-whatsapp text-lg text-green-600" />
                                <div>
                                    <div className="font-medium">{agent.label}</div>
                                    <div className="text-xs text-gray-400">+{agent.number}</div>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            )}
            <button
                onClick={() => setIsOpen((v) => !v)}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-xl transition-transform hover:scale-110"
                aria-label="Chat on WhatsApp"
            >
                <i className="fab fa-whatsapp text-2xl" />
            </button>
        </div>
    );
}
