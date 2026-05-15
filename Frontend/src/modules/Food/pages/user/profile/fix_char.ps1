$file = 'c:\Users\payal\OneDrive\Desktop\Company_Projects\ThindiFood\Frontend\src\modules\Food\pages\user\profile\Favorites.jsx'

# Read file as raw bytes
$bytes = [System.IO.File]::ReadAllBytes($file)

# U+FFFD (corrupted char) in UTF-8 = EF BF BD
# U+2022 (bullet •) in UTF-8 = E2 80 A2
$find    = [byte[]](0xEF, 0xBF, 0xBD)
$replace = [byte[]](0xE2, 0x80, 0xA2)

# Search and replace byte sequence
$result = [System.Collections.Generic.List[byte]]::new()
$i = 0
while ($i -lt $bytes.Length) {
    if ($i + 2 -lt $bytes.Length -and
        $bytes[$i]   -eq $find[0] -and
        $bytes[$i+1] -eq $find[1] -and
        $bytes[$i+2] -eq $find[2]) {
        $result.AddRange($replace)
        $i += 3
    } else {
        $result.Add($bytes[$i])
        $i++
    }
}

[System.IO.File]::WriteAllBytes($file, $result.ToArray())
Write-Host "Done - replaced corrupted char with bullet"
