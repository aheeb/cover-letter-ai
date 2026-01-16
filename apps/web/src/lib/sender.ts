export type SenderProfile = {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country?: string;
  location: string;
};

export function formatSenderAddress(profile: SenderProfile): string {
  const lines = [
    profile.name,
    profile.street,
    `${profile.postalCode} ${profile.city}`.trim(),
  ];

  if (profile.country && profile.country.trim().length > 0) {
    lines.push(profile.country.trim());
  }

  return lines.filter((line) => line.trim().length > 0).join("\n");
}
