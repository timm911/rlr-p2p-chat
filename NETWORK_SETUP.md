# RLR P2P Chat - Network Setup Guide

This guide will help you configure your network for RLR P2P Chat, focusing on setting up port forwarding for the Ripster (listener) role.

## Table of Contents

1. [Understanding P2P Connections](#understanding-p2p-connections)
2. [Network Requirements](#network-requirements)
3. [Finding Your IP Addresses](#finding-your-ip-addresses)
4. [Port Forwarding Setup](#port-forwarding-setup)
5. [Router Configuration Examples](#router-configuration-examples)
6. [Windows Firewall Configuration](#windows-firewall-configuration)
7. [Testing Your Connection](#testing-your-connection)
8. [Common Connection Issues](#common-connection-issues)
9. [Advanced Networking](#advanced-networking)

---

## Understanding P2P Connections

### How P2P Chat Works

RLR P2P Chat creates a **direct connection** between two computers:

```
[RLRJupiter's Computer] ←――――――――→ [Ripster's Computer]
    (Connector)                        (Listener)
```

**Ripster (Listener):**
- Opens a port and waits for incoming connections
- Must have port forwarding configured
- Acts as a "server"

**RLRJupiter (Connector):**
- Initiates connection to Ripster
- Needs to know Ripster's public IP and port
- Acts as a "client"

### Why Port Forwarding is Needed

Home routers use **NAT (Network Address Translation)**, which blocks unsolicited incoming connections from the internet. Port forwarding creates an exception that allows:

1. External connections to reach your computer
2. RLRJupiter to connect to Ripster from anywhere on the internet

**Important:** Only Ripster needs port forwarding. RLRJupiter does not need any special router configuration.

---

## Network Requirements

### For Ripster (Listener)

**Required:**
- Router with port forwarding capability (most home routers support this)
- One available port (default: 54445)
- Admin access to your router

**Recommended:**
- Static IP address on your local network (or DHCP reservation)
- Dynamic DNS service (like No-IP, DynDNS, or DuckDNS)
- Static public IP from ISP (or dynamic DNS if IP changes)

**Optional:**
- DMZ capability (alternative to port forwarding, less secure)
- UPnP support (automatic port forwarding, less common)

### For RLRJupiter (Connector)

**Required:**
- Internet connection
- Knowledge of Ripster's public IP or domain name

**No Special Configuration Needed:**
- No port forwarding
- No router changes
- Works from any network (home, work, mobile hotspot, etc.)

---

## Finding Your IP Addresses

You need to know several IP addresses to configure the connection properly.

### Finding Your Local (Private) IP Address

Your local IP is used on your home network.

**Method 1: Using RLR Chat App**
1. Open RLR P2P Chat
2. Select your identity
3. On the Connection Setup screen, see "Your reachable IPs"
4. Look for addresses starting with `192.168.x.x` or `10.x.x.x`

**Method 2: Using Command Prompt**
1. Press `Windows Key + R`
2. Type `cmd` and press Enter
3. Type `ipconfig` and press Enter
4. Look for "IPv4 Address" under your network adapter
   - Usually starts with `192.168.x.x` (most common)
   - Or `10.x.x.x` or `172.16.x.x to 172.31.x.x`

Example:
```
Ethernet adapter Ethernet:
   IPv4 Address. . . . . . . . . . . : 192.168.1.100
```

### Finding Your Public IP Address

Your public IP is what RLRJupiter uses to connect from the internet.

**Method 1: Using Web Browser**
Visit any of these websites:
- [https://whatismyipaddress.com](https://whatismyipaddress.com)
- [https://www.whatismyip.com](https://www.whatismyip.com)
- [https://ipinfo.io/ip](https://ipinfo.io/ip)

Your public IP will be displayed (e.g., `203.0.113.42`)

**Method 2: Using Router Admin Page**
1. Log into your router (see next section)
2. Look for "WAN IP", "Internet IP", or "External IP"

### Finding Your Router's IP Address (Gateway)

You need this to access your router's configuration page.

**Method 1: Using Command Prompt**
1. Press `Windows Key + R`
2. Type `cmd` and press Enter
3. Type `ipconfig` and press Enter
4. Look for "Default Gateway"
   - Usually `192.168.1.1` or `192.168.0.1`

**Method 2: Common Router IPs**
Try these common addresses in your web browser:
- `192.168.1.1` (most common)
- `192.168.0.1`
- `192.168.2.1`
- `10.0.0.1`
- `10.1.1.1`

---

## Port Forwarding Setup

### Step-by-Step Guide for Ripster

Follow these steps to configure port forwarding on your router.

#### Step 1: Assign Static Local IP (Recommended)

Give your computer a consistent local IP address so port forwarding doesn't break when your IP changes.

**Option A: DHCP Reservation (Recommended)**
1. Log into your router admin page (see below)
2. Find "DHCP Reservation", "Address Reservation", or "Static Lease"
3. Find your computer by name or MAC address
4. Reserve its current IP address
5. Save settings

**Option B: Static IP on Windows**
1. Open Settings → Network & Internet → Ethernet (or Wi-Fi)
2. Click "Change adapter options"
3. Right-click your connection → Properties
4. Select "Internet Protocol Version 4 (TCP/IPv4)" → Properties
5. Select "Use the following IP address"
6. Enter:
   - IP address: Your current local IP (e.g., `192.168.1.100`)
   - Subnet mask: `255.255.255.0` (usually)
   - Default gateway: Your router's IP (e.g., `192.168.1.1`)
   - Preferred DNS: `8.8.8.8` (Google DNS) or your ISP's DNS
7. Click OK

#### Step 2: Access Your Router Admin Page

1. **Open your web browser** (Chrome, Firefox, Edge, etc.)
2. **Type your router's IP** in the address bar (e.g., `http://192.168.1.1`)
3. **Login** with admin credentials:
   - Common defaults:
     - Username: `admin`, Password: `admin`
     - Username: `admin`, Password: `password`
     - Username: `admin`, Password: (blank)
   - Check your router's label/manual for defaults
   - If changed and forgotten, you may need to reset router

#### Step 3: Locate Port Forwarding Settings

Router interfaces vary, but look for these menu names:
- "Port Forwarding"
- "Virtual Server"
- "NAT Forwarding"
- "Applications & Gaming"
- "Firewall" → "Port Forwarding"
- "Advanced" → "Port Forwarding"

#### Step 4: Create Port Forward Rule

Create a new port forwarding rule with these settings:

| Setting | Value | Description |
|---------|-------|-------------|
| **Service/Application Name** | `RLR Chat` or `P2P Chat` | Friendly name for the rule |
| **External/WAN Port** | `54445` | Port visible from internet |
| **Internal/LAN Port** | `54445` | Port on your computer |
| **Internal/Local IP** | `192.168.1.100` | Your computer's local IP (from Step 1) |
| **Protocol** | `TCP` | Must be TCP (not UDP) |
| **Enabled/Active** | `Yes` / `Checked` | Enable the rule |

**Example Configuration:**
```
Service Name:     RLR P2P Chat
External Port:    54445
Internal Port:    54445
Internal IP:      192.168.1.100
Protocol:         TCP
Status:           Enabled
```

#### Step 5: Save and Apply

1. Click "Save", "Apply", or "OK"
2. Router may reboot (wait 1-2 minutes)
3. Your port forwarding is now active

### Using a Different Port

If port 54445 is already in use or blocked:

1. Choose a different port (e.g., `54446`, `54447`, `55000`)
2. Use the same port number in:
   - Router port forwarding rule (external and internal)
   - RLR Chat app connection settings
3. Avoid common ports (80, 443, 22, 3389, etc.)
4. Use ports above 49152 for best compatibility

---

## Router Configuration Examples

Here are examples for popular router brands. Your interface may look different, but concepts are the same.

### TP-Link Routers

1. Open browser → `http://192.168.0.1` or `http://192.168.1.1`
2. Login with admin/admin (or custom credentials)
3. Go to **Advanced** → **NAT Forwarding** → **Virtual Servers**
4. Click **Add** button
5. Configure:
   - Service Type: Custom
   - External Port: 54445
   - Internal IP: 192.168.1.100
   - Internal Port: 54445
   - Protocol: TCP
6. Click **Save**

### Netgear Routers

1. Open browser → `http://192.168.1.1` or `http://routerlogin.net`
2. Login with admin/password (or custom credentials)
3. Go to **Advanced** → **Advanced Setup** → **Port Forwarding/Port Triggering**
4. Select **Port Forwarding** radio button
5. Click **Add Custom Service**
6. Configure:
   - Service Name: RLR Chat
   - Service Type: TCP
   - External Starting Port: 54445
   - External Ending Port: 54445
   - Internal Starting Port: 54445
   - Internal Ending Port: 54445
   - Server IP Address: 192.168.1.100
7. Click **Apply**

### Linksys Routers

1. Open browser → `http://192.168.1.1` or `http://myrouter.local`
2. Login with admin credentials
3. Go to **Security** → **Apps and Gaming** → **Single Port Forwarding**
4. Find first available rule slot
5. Configure:
   - Application Name: RLR Chat
   - External Port: 54445
   - Internal Port: 54445
   - Protocol: TCP
   - To IP Address: 192.168.1.100
   - Enabled: Check the box
6. Click **Save Settings**

### ASUS Routers

1. Open browser → `http://router.asus.com` or `http://192.168.1.1`
2. Login with admin credentials
3. Go to **Advanced Settings** → **WAN** → **Virtual Server/Port Forwarding**
4. Click **Add profile** button
5. Configure:
   - Service Name: RLR Chat
   - Port Range: 54445
   - Local IP: 192.168.1.100
   - Local Port: 54445
   - Protocol: TCP
6. Click **OK** then **Apply**

### D-Link Routers

1. Open browser → `http://192.168.0.1`
2. Login with admin credentials
3. Go to **Advanced** → **Port Forwarding**
4. Click **Add** button
5. Configure:
   - Name: RLR Chat
   - Public Port: 54445
   - Private Port: 54445
   - Traffic Type: TCP
   - Schedule: Always
   - Computer IP: 192.168.1.100
6. Click **Save**

### Actiontec (Verizon/Frontier FiOS)

1. Open browser → `http://192.168.1.1`
2. Login with admin credentials
3. Go to **Advanced** → **Port Forwarding**
4. Under **Configure Individual Services**, click **Add**
5. Configure:
   - Description: RLR Chat
   - Type: TCP
   - External Port: 54445
   - Internal Port: 54445
   - Device IP: 192.168.1.100
6. Click **Apply**

### Can't Find Your Router Type?

1. Search Google for: "[Your Router Model] port forwarding guide"
2. Visit [https://portforward.com/router.htm](https://portforward.com/router.htm)
3. Consult your router's manual (usually available as PDF download from manufacturer)

---

## Windows Firewall Configuration

Windows Firewall may block the app. You need to allow it.

### Allow App Through Firewall (Recommended)

**Method 1: When First Prompted**
1. First time you run RLR Chat, Windows may show security alert
2. Check boxes for:
   - **Private networks** (home/work)
   - **Public networks** (optional, for coffee shop usage)
3. Click **Allow access**

**Method 2: Manual Configuration**
1. Open **Windows Security** (search in Start menu)
2. Click **Firewall & network protection**
3. Click **Allow an app through firewall**
4. Click **Change settings** (may require admin)
5. Click **Allow another app...**
6. Click **Browse...** and locate:
   - Default install: `C:\Program Files\RLR P2P Chat\RLR P2P Chat.exe`
   - Or search for `RLR P2P Chat.exe`
7. Click **Add**
8. Check both **Private** and **Public** (if desired)
9. Click **OK**

### Create Inbound Rule (Advanced)

For Ripster (listener), create specific inbound rule:

1. Open **Windows Defender Firewall with Advanced Security**
   - Search in Start menu or
   - Run: `wf.msc`
2. Click **Inbound Rules** on left
3. Click **New Rule...** on right
4. Select **Port** → Next
5. Configure:
   - Protocol: **TCP**
   - Specific local ports: **54445** (or your custom port)
   - Click **Next**
6. Action: **Allow the connection** → Next
7. Profile: Check all three (Domain, Private, Public) → Next
8. Name: **RLR P2P Chat - Listener Port** → Finish

### Disable Firewall (Not Recommended)

Only for testing - NOT recommended for regular use:

1. Open **Windows Security** → **Firewall & network protection**
2. Click your active network profile
3. Turn off **Windows Defender Firewall**
4. Test connection
5. **Turn firewall back on** when done testing

---

## Testing Your Connection

Verify your setup is working correctly.

### Step 1: Test Port is Open

**Option A: Using Online Port Checker**
1. Make sure RLR Chat is running and listening (Ripster has clicked "Start Listening")
2. Visit: [https://www.yougetsignal.com/tools/open-ports/](https://www.yougetsignal.com/tools/open-ports/)
3. Enter:
   - Remote Address: Your public IP (leave blank to auto-detect)
   - Port Number: 54445
4. Click **Check**
5. Result should say: **"Port 54445 is open on [your IP]"**

**Option B: Using canyouseeme.org**
1. Make sure RLR Chat is running and listening
2. Visit: [https://canyouseeme.org/](https://canyouseeme.org/)
3. Enter Port: **54445**
4. Click **Check Port**
5. Should show: **"Success: I can see your service..."**

**Important:** App must be running and listening for tests to pass. If app is closed, port appears closed.

### Step 2: Test Local Connection First

Before testing over internet, verify local network works:

**Setup:**
1. Both users on same network (same WiFi or same router)
2. Ripster clicks "Start Listening" with port 54445
3. RLRJupiter uses Ripster's **local IP** (e.g., `192.168.1.100`) with port 54445
4. RLRJupiter clicks "Connect"

**Expected:** Connection succeeds, chat window opens

**If this fails:** Problem is with firewall or app, not router configuration

### Step 3: Test Internet Connection

Once local connection works, test over internet:

**Setup:**
1. RLRJupiter uses different network (mobile hotspot, different WiFi, etc.)
2. Ripster clicks "Start Listening" with port 54445
3. RLRJupiter uses Ripster's **public IP** (or domain) with port 54445
4. RLRJupiter clicks "Connect"

**Expected:** Connection succeeds, chat window opens

**If this fails:** Check port forwarding and firewall

---

## Common Connection Issues

### Issue: "Connection Failed" Error

**Causes:**
- Port forwarding not configured correctly
- Firewall blocking connection
- Wrong IP address or port
- ISP blocking the port
- Router or modem needs restart

**Solutions:**

1. **Verify port forwarding:**
   - Log into router
   - Check rule is enabled
   - Verify internal IP matches computer's IP
   - Confirm port numbers match (external = internal = app setting)

2. **Check firewall:**
   - Ensure Windows Firewall allows the app
   - Temporarily disable antivirus (test only)
   - Check router's firewall settings

3. **Verify IP and port:**
   - Ripster: Confirm public IP hasn't changed
   - RLRJupiter: Ensure using correct public IP or domain
   - Both: Verify port number matches (54445)

4. **Restart devices:**
   - Restart RLR Chat app
   - Restart router and modem (unplug 30 seconds)
   - Restart computer

5. **Try different port:**
   - Some ISPs block certain ports
   - Try ports: 54446, 55000, 50000, etc.
   - Update router rule and app settings

### Issue: Port Shows Closed in Online Tests

**Causes:**
- App not running or not listening
- Port forwarding incorrect
- Firewall blocking

**Solutions:**

1. **Ensure app is listening:**
   - Ripster must click "Start Listening"
   - App must show "Waiting for connection"
   - Don't close app during test

2. **Double-check port forward:**
   - External port = Internal port = Port in app
   - Protocol is TCP (not UDP)
   - Internal IP is correct
   - Rule is enabled

3. **Test with firewall off:**
   - Temporarily disable Windows Firewall
   - Test port
   - If now open, firewall is the issue
   - Re-enable firewall and configure properly

### Issue: Works on Local Network but Not Internet

**Causes:**
- Port forwarding only applies to external connections
- Using wrong IP address
- ISP using CGNAT (Carrier-Grade NAT)

**Solutions:**

1. **Use public IP from internet:**
   - RLRJupiter must use Ripster's public IP, not local IP
   - Get public IP from whatismyip.com

2. **Check for CGNAT:**
   - Compare public IP on whatismyip.com to router's WAN IP
   - If different, ISP uses CGNAT (port forwarding won't work)
   - Solutions:
     - Request public IP from ISP (may cost extra)
     - Use VPN with port forwarding
     - Use alternative: VPN, Hamachi, ZeroTier

3. **Verify port forward external port:**
   - External port in router must match port RLRJupiter connects to

### Issue: Connection Drops Randomly

**Causes:**
- Unstable internet connection
- Router timeout settings
- ISP issues

**Solutions:**

1. **Check connection stability:**
   - Run speed test: [https://www.speedtest.net/](https://www.speedtest.net/)
   - Look for packet loss
   - Use wired Ethernet instead of WiFi

2. **Adjust router timeout:**
   - Some routers have NAT timeout settings
   - Increase TCP timeout (if available)
   - Update router firmware

3. **Restart connection:**
   - Use "Change Connection" in Settings
   - Reconnect to establish new session

### Issue: Can't Access Router Admin Page

**Causes:**
- Wrong router IP
- Browser issues
- Router problems

**Solutions:**

1. **Find correct IP:**
   - Run `ipconfig` in Command Prompt
   - Look for Default Gateway
   - Try common IPs: 192.168.1.1, 192.168.0.1, 10.0.0.1

2. **Browser troubleshooting:**
   - Try different browser
   - Clear cache and cookies
   - Try http:// explicitly (not https://)
   - Disable browser extensions

3. **Connect via Ethernet:**
   - WiFi might not allow admin access
   - Connect computer directly to router with cable

4. **Factory reset router:**
   - Last resort only (will lose all settings)
   - Hold reset button 10-30 seconds
   - Use default login from router label

---

## Advanced Networking

### Using Dynamic DNS (DDNS)

If your ISP changes your public IP frequently, use DDNS:

**What is DDNS?**
- Service that maps a domain name (e.g., <your-ripster-ddns-host>) to your changing IP
- IP changes, DDNS updates automatically
- RLRJupiter always uses same domain name

**Popular Free DDNS Services:**
- No-IP: [https://www.noip.com/](https://www.noip.com/)
- DuckDNS: [https://www.duckdns.org/](https://www.duckdns.org/)
- Dynu: [https://www.dynu.com/](https://www.dynu.com/)
- FreeDNS: [https://freedns.afraid.org/](https://freedns.afraid.org/)

**Setup Process:**
1. Create account with DDNS provider
2. Create hostname (e.g., ripster.ddns.net)
3. Configure router to update DDNS (if supported)
   - Or install DDNS client on computer
4. Use hostname in RLR Chat instead of IP address

**Router DDNS Setup (Example):**
1. Log into router
2. Find "Dynamic DNS" or "DDNS" section
3. Select provider (No-IP, DynDNS, etc.)
4. Enter account credentials
5. Enter hostname
6. Enable DDNS
7. Save settings

### DMZ Alternative (Less Secure)

If port forwarding doesn't work, try DMZ (not recommended for security):

**What is DMZ?**
- Places your computer outside router's firewall
- All ports forwarded to your computer
- Less secure than port forwarding

**Setup:**
1. Log into router
2. Find "DMZ" settings
3. Enable DMZ
4. Enter your computer's local IP
5. Save settings

**Warning:** This exposes your computer to all internet traffic. Only use for testing or if no alternative.

### UPnP (Universal Plug and Play)

Some routers support automatic port forwarding:

**Setup:**
1. Log into router
2. Find "UPnP" settings (often under Advanced or Network)
3. Enable UPnP
4. Save settings
5. Router may automatically forward ports for RLR Chat

**Note:** UPnP not all routers support this, and it's often disabled for security reasons.

### VPN Solutions

If nothing else works (e.g., ISP uses CGNAT):

**Option A: VPN with Port Forwarding**
- Services like AirVPN, PIA (Private Internet Access)
- Purchase VPN subscription
- Configure port forwarding in VPN control panel
- Use VPN's IP and forwarded port in RLR Chat

**Option B: Virtual LAN**
- Hamachi: [https://www.vpn.net/](https://www.vpn.net/)
- ZeroTier: [https://www.zerotier.com/](https://www.zerotier.com/)
- Creates virtual local network over internet
- Both users install software
- Connect to same network
- Use virtual IP addresses in RLR Chat

### Mobile Hotspot

If testing from mobile hotspot:

**Limitations:**
- Most carriers use CGNAT (no incoming connections)
- Ripster cannot listen on mobile hotspot
- RLRJupiter can connect from mobile hotspot
- Data usage: Text chat = minimal, File transfers = significant

**Recommendation:**
- Use mobile hotspot only for RLRJupiter (connector)
- Ripster should use home internet with port forwarding

---

## Quick Reference

### Ports Used

| Port | Purpose | User |
|------|---------|------|
| 54445 | Default P2P connection | Both (configurable) |

### IP Address Types

| Type | Example | Purpose |
|------|---------|---------|
| Local/Private IP | 192.168.1.100 | LAN connections, port forwarding setup |
| Public IP | 203.0.113.42 | Internet connections |
| Gateway IP | 192.168.1.1 | Router admin access |
| DDNS Hostname | <your-ripster-ddns-host> | Alternative to public IP |

### Required for Ripster

- ✅ Port forwarding configured
- ✅ Windows Firewall allows app
- ✅ Static local IP (recommended)
- ✅ Public IP or DDNS domain
- ✅ Router admin access

### Required for RLRJupiter

- ✅ Ripster's public IP or DDNS domain
- ✅ Correct port number (54445)
- ✅ Internet connection

---

## Checklist: Is Your Network Ready?

Use this checklist to verify your setup:

### For Ripster (Listener)

- [ ] Know your local IP address (e.g., 192.168.1.100)
- [ ] Know your public IP address (e.g., 203.0.113.42)
- [ ] Know your router's IP address (e.g., 192.168.1.1)
- [ ] Can access router admin page
- [ ] Created port forwarding rule:
  - [ ] External port: 54445
  - [ ] Internal port: 54445
  - [ ] Internal IP: Your local IP
  - [ ] Protocol: TCP
  - [ ] Rule is enabled
- [ ] Windows Firewall allows RLR P2P Chat
- [ ] Tested port is open using online checker
- [ ] Shared public IP/domain with RLRJupiter

### For RLRJupiter (Connector)

- [ ] Have Ripster's public IP or domain name
- [ ] Have correct port number (54445)
- [ ] Have internet connection
- [ ] App can access network (firewall allows)

---

**Need more help?** See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and solutions.
