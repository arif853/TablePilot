import React, { useState, useEffect, useRef } from 'react';
import { customerChatAPI } from '../../services/api';
import {
    MessageCircle,
    X,
    Send,
    Loader2,
    Bot,
    User,
    Sparkles,
    Menu,
    Star,
    Leaf,
    Search,
} from 'lucide-react';
import { restaurantInkColor } from '../../utils/restaurantTheme';

const iconMap = {
    menu: Menu,
    star: Star,
    leaf: Leaf,
    search: Search,
};

const CustomerChatWidget = ({ tenantSlug, primaryColor = '#ED802A' }) => {
    const inkColor = restaurantInkColor(primaryColor);
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [welcomeMessage, setWelcomeMessage] = useState('');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen && messages.length === 0) {
            loadSuggestions();
        }
    }, [isOpen]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const loadSuggestions = async () => {
        try {
            const response = await customerChatAPI.getSuggestions(tenantSlug);
            setSuggestions(response.data.suggestions || []);
            setWelcomeMessage(response.data.welcome_message || '');

            if (response.data.welcome_message) {
                setMessages([
                    {
                        role: 'assistant',
                        content: response.data.welcome_message,
                        timestamp: new Date(),
                    },
                ]);
            }
        } catch (error) {
            console.error('Failed to load suggestions:', error);
        }
    };

    const sendMessage = async (message) => {
        if (!message.trim() || loading) return;

        const userMessage = {
            role: 'user',
            content: message.trim(),
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInputValue('');
        setLoading(true);

        try {
            const response = await customerChatAPI.chat(tenantSlug, message, sessionId);
            const data = response.data;

            if (data.session_id && !sessionId) {
                setSessionId(data.session_id);
            }

            if (data.suggestions) {
                setSuggestions(data.suggestions.map((s) => ({ text: s })));
            }

            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: data.message,
                    timestamp: new Date(),
                },
            ]);
        } catch (error) {
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: "Sorry, I'm having trouble responding right now. Please try again.",
                    timestamp: new Date(),
                    error: true,
                },
            ]);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        sendMessage(inputValue);
    };

    const handleSuggestionClick = (text) => {
        sendMessage(text);
    };

    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };

    return (
        <>
            {/* Chat Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-20 right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all transform hover:scale-105 active:scale-95"
                style={{ backgroundColor: primaryColor }}
            >
                {isOpen ? (
                    <X className="w-6 h-6 text-on-restaurant" />
                ) : (
                    <MessageCircle className="w-6 h-6 text-on-restaurant" />
                )}
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="fixed bottom-36 right-4 z-50 w-[340px] max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
                    style={{ maxHeight: 'calc(100vh - 200px)' }}
                >
                    {/* Header */}
                    <div
                        className="px-4 py-3 flex items-center gap-3"
                        style={{ backgroundColor: primaryColor }}
                    >
                        <div className="w-10 h-10 bg-on-restaurant/15 rounded-full flex items-center justify-center">
                            <Bot className="w-5 h-5 text-on-restaurant" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-on-restaurant font-semibold text-sm">Menu Assistant</h3>
                            <p className="text-on-restaurant/80 text-xs">Here to help you order</p>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 hover:bg-on-restaurant/15 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-on-restaurant" />
                        </button>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[250px] max-h-[350px] bg-gray-50">
                        {messages.map((msg, index) => (
                            <div
                                key={index}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`flex gap-2 max-w-[85%] ${
                                        msg.role === 'user' ? 'flex-row-reverse' : ''
                                    }`}
                                >
                                    <div
                                        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                                            msg.role === 'user'
                                                ? 'bg-gray-200'
                                                : ''
                                        }`}
                                        style={msg.role === 'assistant' ? { backgroundColor: `${primaryColor}20` } : {}}
                                    >
                                        {msg.role === 'user' ? (
                                            <User className="w-4 h-4 text-gray-600" />
                                        ) : (
                                            <Sparkles className="w-4 h-4" style={{ color: inkColor }} />
                                        )}
                                    </div>
                                    <div>
                                        <div
                                            className={`px-3 py-2 rounded-2xl text-sm ${
                                                msg.role === 'user'
                                                    ? 'text-on-restaurant rounded-br-md'
                                                    : 'bg-white border border-gray-100 text-gray-800 rounded-bl-md shadow-sm'
                                            } ${msg.error ? 'bg-red-50 border-red-200 text-red-700' : ''}`}
                                            style={msg.role === 'user' && !msg.error ? { backgroundColor: primaryColor } : {}}
                                        >
                                            <div
                                                className="whitespace-pre-wrap"
                                                dangerouslySetInnerHTML={{
                                                    __html: msg.content
                                                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                                        .replace(/\n/g, '<br/>')
                                                }}
                                            />
                                        </div>
                                        <p className={`text-[10px] text-gray-400 mt-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                                            {formatTime(msg.timestamp)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="flex gap-2 max-w-[85%]">
                                    <div
                                        className="w-7 h-7 rounded-full flex items-center justify-center"
                                        style={{ backgroundColor: `${primaryColor}20` }}
                                    >
                                        <Sparkles className="w-4 h-4" style={{ color: inkColor }} />
                                    </div>
                                    <div className="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
                                        <div className="flex gap-1">
                                            <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                            <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                            <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Suggestions */}
                    {suggestions.length > 0 && messages.length <= 1 && (
                        <div className="px-3 py-2 border-t border-gray-100 bg-white">
                            <p className="text-xs text-gray-400 mb-2">Quick questions:</p>
                            <div className="flex flex-wrap gap-2">
                                {suggestions.slice(0, 4).map((suggestion, index) => {
                                    const IconComponent = iconMap[suggestion.icon] || MessageCircle;
                                    return (
                                        <button
                                            key={index}
                                            onClick={() => handleSuggestionClick(suggestion.text)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-full text-xs text-gray-700 transition-colors border border-gray-200"
                                        >
                                            <IconComponent className="w-3 h-3" style={{ color: inkColor }} />
                                            {suggestion.text}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Input */}
                    <form onSubmit={handleSubmit} className="p-3 border-t border-gray-100 bg-white">
                        <div className="flex gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Ask about our menu..."
                                className="flex-1 px-4 py-2.5 bg-gray-50 rounded-xl text-sm border border-gray-200 focus:border-gray-300 focus:ring-2 focus:ring-gray-100 outline-none"
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                disabled={loading || !inputValue.trim()}
                                className="px-4 py-2.5 rounded-xl text-on-restaurant font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
                                style={{ backgroundColor: primaryColor }}
                            >
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Send className="w-5 h-5" />
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
};

export default CustomerChatWidget;
