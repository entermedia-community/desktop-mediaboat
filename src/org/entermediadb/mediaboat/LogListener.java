package org.entermediadb.mediaboat;

public interface LogListener
{
	public void reportError(String inString, Throwable inEx);
	public void info(String inString);

}
