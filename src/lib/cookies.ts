import cookies from "cookie";

export const parseCookies = (rawCookies?: string) => cookies.parse(rawCookies ?? "");
