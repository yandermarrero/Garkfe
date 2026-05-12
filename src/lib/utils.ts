import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-AR', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount).replace('USD', '$');
}

export function formatNumber(amount: number | string) {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(n)) return '0,00';
  // Use a more robust rounding for financial numbers
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function toLocalISO(dateString: string) {
  const date = new Date(dateString);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
}

export function fromLocalISO(localString: string) {
  return new Date(localString).toISOString();
}
