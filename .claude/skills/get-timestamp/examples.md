## Usage

```bash
# Default format (yyyy-MM-dd_HH-mm)
node timestamp.js

# Custom format - date only
node timestamp.js "yyyy-MM-dd"

# Custom format - time only
node timestamp.js "HH:mm:ss"

# Custom format - with milliseconds
node timestamp.js "yyyy-MM-dd_HH-mm-ss.SSS"

# Custom format - 12-hour time
node timestamp.js "yyyy-MM-dd hh:mm:ss A"
```

## Supported Format Tokens

- `yyyy` - 4-digit year (e.g., 2025)
- `yy` - 2-digit year (e.g., 25)
- `MM` - 2-digit month (01-12)
- `M` - 1 or 2-digit month (1-12)
- `dd` - 2-digit day (01-31)
- `d` - 1 or 2-digit day (1-31)
- `HH` - 2-digit hour in 24-hour format (00-23)
- `H` - 1 or 2-digit hour in 24-hour format (0-23)
- `hh` - 2-digit hour in 12-hour format (01-12)
- `h` - 1 or 2-digit hour in 12-hour format (1-12)
- `mm` - 2-digit minutes (00-59)
- `m` - 1 or 2-digit minutes (0-59)
- `ss` - 2-digit seconds (00-59)
- `s` - 1 or 2-digit seconds (0-59)
- `SSS` - 3-digit milliseconds (000-999)
- `A` - AM/PM (uppercase)
- `a` - am/pm (lowercase)
