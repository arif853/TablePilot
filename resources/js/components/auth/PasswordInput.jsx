import React, { useState } from 'react';
import { HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';

export default function PasswordInput({ id, className = '', ...props }) {
    const [visible, setVisible] = useState(false);

    return (
        <div className="relative">
            <input id={id} type={visible ? 'text' : 'password'} className={`input pr-11 ${className}`} {...props} />
            <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-controls={id}
            >
                {visible ? <HiOutlineEyeOff className="h-5 w-5" /> : <HiOutlineEye className="h-5 w-5" />}
            </button>
        </div>
    );
}
