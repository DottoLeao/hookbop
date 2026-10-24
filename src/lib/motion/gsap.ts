import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

// Only GSAP's core and its React hook. No ScrollTrigger and no smooth scrolling (Lenis): they would fight the
// Karaokê list, which scrolls on its own. Registering the hook ties it to this copy of GSAP.
gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };
