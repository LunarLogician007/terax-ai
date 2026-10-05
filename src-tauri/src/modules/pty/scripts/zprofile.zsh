# toss-shell-integration (zprofile)
#
# See zshenv.zsh for the rationale on the trailing `:`.
{
  _toss_user_zdotdir="${TOSS_USER_ZDOTDIR:-$HOME}"
  [ -f "$_toss_user_zdotdir/.zprofile" ] && source "$_toss_user_zdotdir/.zprofile"
  unset _toss_user_zdotdir
}
:
