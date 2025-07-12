import { config } from "../config";
import { WebServiceClient } from "@maxmind/geoip2-node";

export interface LocationInfo {
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  formatted: string;
  accuracy?: number;
  isEuMember?: boolean;
}

class GeoIPService {
  private client: WebServiceClient | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initializeClient();
  }

  private initializeClient() {
    try {
      if (!config.MAXMIND_ACCOUNT_ID || !config.MAXMIND_LICENSE_KEY) {
        console.warn("⚠️  MaxMind GeoIP not configured. Location detection will be limited.");
        return;
      }

      this.client = new WebServiceClient(config.MAXMIND_ACCOUNT_ID, config.MAXMIND_LICENSE_KEY, {
        timeout: 5000, // 5 second timeout
      });

      this.isConfigured = true;
      console.log("✅ MaxMind GeoIP WebServiceClient initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize MaxMind GeoIP WebServiceClient:", error);
      this.isConfigured = false;
    }
  }

  async getLocationInfo(ipAddress: string): Promise<LocationInfo | null> {
    // Handle localhost and private IPs
    if (this.isPrivateIP(ipAddress)) {
      return {
        ip: ipAddress,
        city: "Local",
        country: "Local Development",
        countryCode: "LOCAL",
        formatted: "Local Development",
      };
    }

    if (!this.isConfigured || !this.client) {
      return {
        ip: ipAddress,
        formatted: "Unknown Location",
      };
    }

    try {
      // Use the city method for detailed location information
      const response = await this.client.city(ipAddress);

      const locationInfo: LocationInfo = {
        ip: ipAddress,
        city: response.city?.names?.en,
        region: response.subdivisions?.[0]?.names?.en,
        country: response.country?.names?.en,
        countryCode: response.country?.isoCode,
        latitude: response.location?.latitude,
        longitude: response.location?.longitude,
        timezone: response.location?.timeZone,
        accuracy: response.location?.accuracyRadius,
        isEuMember: response.country?.isInEuropeanUnion,
        formatted: this.formatLocation(response),
      };

      return locationInfo;
    } catch (error: any) {
      // Handle specific MaxMind errors
      if (error.name === "AddressNotFoundError") {
        console.log(`IP ${ipAddress} not found in MaxMind database`);
        return {
          ip: ipAddress,
          formatted: "Unknown Location",
        };
      }

      if (error.name === "AuthenticationError") {
        console.error("MaxMind authentication failed. Check your account ID and license key.");
        return {
          ip: ipAddress,
          formatted: "Unknown Location",
        };
      }

      if (error.name === "InsufficientFundsError") {
        console.error("MaxMind account has insufficient funds.");
        return {
          ip: ipAddress,
          formatted: "Unknown Location",
        };
      }

      if (error.name === "PermissionRequiredError") {
        console.error("MaxMind account doesn't have permission for this service.");
        return {
          ip: ipAddress,
          formatted: "Unknown Location",
        };
      }

      console.error("GeoIP lookup error:", {
        error: error.message,
        name: error.name,
        ip: ipAddress,
      });

      // Return basic info on other errors
      return {
        ip: ipAddress,
        formatted: "Unknown Location",
      };
    }
  }

  async getCountryInfo(
    ipAddress: string,
  ): Promise<{ country?: string; countryCode?: string } | null> {
    if (this.isPrivateIP(ipAddress) || !this.isConfigured || !this.client) {
      return null;
    }

    try {
      // Use the country method for faster lookups when you only need country info
      const response = await this.client.country(ipAddress);

      return {
        country: response.country?.names?.en,
        countryCode: response.country?.isoCode,
      };
    } catch (error) {
      console.error("GeoIP country lookup error:", error);
      return null;
    }
  }

  async getInsightsInfo(ipAddress: string): Promise<any | null> {
    if (this.isPrivateIP(ipAddress) || !this.isConfigured || !this.client) {
      return null;
    }

    try {
      const response = await this.client.insights(ipAddress);

      return {
        ip: ipAddress,
        city: response.city?.names?.en,
        region: response.subdivisions?.[0]?.names?.en,
        country: response.country?.names?.en,
        countryCode: response.country?.isoCode,
        latitude: response.location?.latitude,
        longitude: response.location?.longitude,
        timezone: response.location?.timeZone,
        isp: response.traits?.isp,
        organization: response.traits?.organization,
        domain: response.traits?.domain,
        userType: response.traits?.userType,
        isAnonymousProxy: response.traits?.isAnonymousProxy,
        isSatelliteProvider: response.traits?.isSatelliteProvider,
        formatted: this.formatLocation(response),
      };
    } catch (error) {
      console.error("GeoIP insights lookup error:", error);
      return null;
    }
  }

  private formatLocation(response: any): string {
    const parts: string[] = [];

    if (response.city?.names?.en) {
      parts.push(response.city.names.en);
    }

    if (response.subdivisions?.[0]?.names?.en) {
      parts.push(response.subdivisions[0].names.en);
    }

    if (response.country?.names?.en) {
      parts.push(response.country.names.en);
    }

    return parts.length > 0 ? parts.join(", ") : "Unknown Location";
  }

  private isPrivateIP(ip: string): boolean {
    // Check for localhost
    if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") {
      return true;
    }

    // Check for private IP ranges
    const privateRanges = [
      /^10\./, // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
      /^169\.254\./, // 169.254.0.0/16 (link-local)
      /^fe80:/i, // IPv6 link-local
      /^::1$/, // IPv6 localhost
    ];

    return privateRanges.some((range) => range.test(ip));
  }

  // Helper method to check if service is ready
  isReady(): boolean {
    return this.isConfigured && this.client !== null;
  }

  // Get service status and account info
  async getServiceStatus(): Promise<{
    isConfigured: boolean;
    hasCredentials: boolean;
    canConnect?: boolean;
    error?: string;
  }> {
    const status = {
      isConfigured: this.isConfigured,
      hasCredentials: !!(config.MAXMIND_ACCOUNT_ID && config.MAXMIND_LICENSE_KEY),
    };

    if (!this.isConfigured || !this.client) {
      return {
        ...status,
        canConnect: false,
        error: "Service not configured",
      };
    }

    try {
      // Test with a known public IP (Google's DNS)
      await this.client.country("8.8.8.8");
      return {
        ...status,
        canConnect: true,
      };
    } catch (error: any) {
      return {
        ...status,
        canConnect: false,
        error: error.message || "Connection test failed",
      };
    }
  }

  // Batch lookup for multiple IPs (useful for analytics)
  async getMultipleLocations(ipAddresses: string[]): Promise<Map<string, LocationInfo | null>> {
    const results = new Map<string, LocationInfo | null>();

    // Process in smaller batches to respect rate limits
    const batchSize = 5;
    for (let i = 0; i < ipAddresses.length; i += batchSize) {
      const batch = ipAddresses.slice(i, i + batchSize);
      const batchPromises = batch.map(async (ip) => {
        const location = await this.getLocationInfo(ip);
        return [ip, location] as const;
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(([ip, location]) => {
        results.set(ip, location);
      });

      // Small delay between batches to be respectful to the API
      if (i + batchSize < ipAddresses.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return results;
  }
}

export const geoipService = new GeoIPService();
