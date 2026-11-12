/**
 * ASR 提供商官方 Logo SVG 组件
 */

import type { SVGProps } from 'react'
import ggmlOrgLogo from '../../assets/ggml-org.png'

type LogoProps = SVGProps<SVGSVGElement> & { size?: number }
type AnyLogoProps = { size?: number; className?: string }

const defaultSize = 20

export function VolcengineLogo({ size = defaultSize, className, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M19.44 10.153l-2.936 11.586a.215.215 0 00.214.261h5.87a.215.215 0 00.214-.261l-2.95-11.586a.214.214 0 00-.412 0zM3.28 12.778l-2.275 8.96A.214.214 0 001.22 22h4.532a.212.212 0 00.214-.165.214.214 0 000-.097l-2.276-8.96a.214.214 0 00-.41 0z"
        fill="#00E5E5"
      />
      <path
        d="M7.29 5.359L3.148 21.738a.215.215 0 00.203.261h8.29a.214.214 0 00.215-.261L7.7 5.358a.214.214 0 00-.41 0z"
        fill="#006EFF"
      />
      <path
        d="M14.44.15a.214.214 0 00-.41 0L8.366 21.739a.214.214 0 00.214.261H19.9a.216.216 0 00.171-.078.214.214 0 00.044-.183L14.439.15z"
        fill="#006EFF"
      />
      <path
        d="M10.278 7.741L6.685 21.736a.214.214 0 00.214.264h7.17a.215.215 0 00.214-.264L10.688 7.741a.214.214 0 00-.41 0z"
        fill="#00E5E5"
      />
    </svg>
  )
}

export function OpenAILogo({ size = defaultSize, className, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"
        fill="currentColor"
      />
    </svg>
  )
}

export function SenseVoiceLogo({ size = defaultSize, className, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect x="2" y="2" width="20" height="20" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 12c0-2.8 2.2-5 5-5s5 2.2 5 5-2.2 5-5 5"
        fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <path
        d="M5 8.5h2M5 15.5h2M17 8.5h2M17 15.5h2"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      />
    </svg>
  )
}

export function WhisperCppLogo({ size = defaultSize, className }: LogoProps) {
  return (
    <img
      src={ggmlOrgLogo}
      alt="whisper.cpp (ggml)"
      width={size}
      height={size}
      className={`rounded ${className || ''}`}
      style={{ objectFit: 'contain' }}
    />
  )
}

const PROVIDER_LOGO_MAP: Record<string, (props: AnyLogoProps) => JSX.Element> = {
  volc: VolcengineLogo,
  local_openai: OpenAILogo,
  local_whisper_cpp: WhisperCppLogo,
  sensevoice: SenseVoiceLogo,
}

export function getProviderLogo(
  providerId: string,
  size = defaultSize,
  className?: string
): JSX.Element | null {
  const Logo = PROVIDER_LOGO_MAP[providerId]
  if (!Logo) return null
  return <Logo size={size} className={className} />
}
