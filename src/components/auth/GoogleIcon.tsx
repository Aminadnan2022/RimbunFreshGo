import googleGLogo from '../../assets/images/google-g-logo.png';

type GoogleIconProps = {
  className?: string;
};

export default function GoogleIcon({ className = 'h-[18px] w-auto' }: GoogleIconProps) {
  return <img src={googleGLogo} alt="" aria-hidden="true" className={className} draggable={false} />;
}
